# Phase 4: India Intraday Stocks + Options (Buy-only) Strategy Research & Build Plan

Updated: 2026-01-31 (IST)

## Objective
Define a repeatable research-to-paper-trading pipeline for buy-only options strategies on NSE equities and NSE F&O using the existing Postgres 1-minute OHLCV data. This phase must not place real orders. It extends Phase-3 by adding a systematic evaluation framework, data realism upgrades, and a paper trading engine that uses realistic fills and risk controls.

## Scope and assumptions
- Markets: NSE equities + NSE F&O (index and stock options).
- Timeframes: 1-minute bars (source), resampled to 3m/5m/15m/30m/60m, plus daily bars.
- Options are buy-only (long calls/puts, long premium via straddle/strangle). No short option selling.
- Live trading must remain disabled; paper trading only.
- Current data: per-instrument 1-minute OHLCV in Postgres.

## India market specifics to bake into the engine
- Equity & options session: 09:15–15:30 IST.
- Futures pre-open: 09:00–09:15 IST (equity derivatives futures).
- Expiry calendar: do not assume Thursday expiry; resolve from instrument master + exchange circular logic.
- India VIX: use as a regime gate (trend vs chop vs volatility expansion).
- Intraday risk controls: enforce time-based exits to avoid expiry-day and end-of-day surprises.

## Data you have vs data you must add
### Current (available now)
- 1-minute OHLCV per instrument.
- Daily bars for ~3 years (equity + index).
- Instrument master (token mapping) and subscription universe.

### Additions for realistic options backtests
1) Instrument master snapshots (historical): token, symbol, underlying, expiry, strike, CE/PE, lot size, tick size.
2) Best bid/ask or depth snapshots (options + underlyings) for realistic fills.
3) OI snapshots (futures + options) for OI/PCR/chain strategies.
4) Corporate events (financial results, corporate actions) as event-risk flags.
5) Macro overlays (USDINR, crude, gold/silver, global indices) for regime shocks.

## Strategy catalog (buy-only options)
### A) Trend-following / momentum (directional long premium)
- Supertrend continuation.
- EMA crossover (9/21) with EMA50 slope + ADX.
- EMA pullback in trend (EMA50 filter + EMA20 pullback).
- MACD histogram expansion.
- ADX + DI alignment.
- Donchian breakout (20-bar high/low).

### B) Breakouts / range expansion
- Opening range breakout (ORB) 5/15m with volume filter.
- Previous day high/low breakout.
- NR4/NR7 compression breakout.
- Bollinger breakout + bandwidth expansion.
- Keltner breakout.
- Gap-and-go with VWAP/ATR trail.

### C) Mean reversion (use strict filters due to theta)
- VWAP mean reversion.
- Bollinger mean reversion + RSI confirmation.
- RSI failure swing.

### D) Volatility expansion (best fit for buy-only options)
- Bollinger squeeze -> long straddle/strangle.
- ATR compression -> expansion.
- Trend-day detection (hold winners with trail).

### E) Chain / positioning strategies (requires OI + chain coverage)
- OI build-up confirmation (price + futures OI change).
- PCR extremes (contrarian or confirmation).
- OI wall / max pain (trade break of heavy OI clusters).

## Evaluation pipeline (repeatable, regime-aware)
1) Regime filter
   - ADX, BB bandwidth, ATR%, VWAP slope, volume z-score.
   - India VIX level/change as higher-level regime gate.

2) Signal rules + option selection
   - Directional: ATM or 1-step ITM calls/puts.
   - Volatility: straddle/strangle (ATM ±1/±2 strikes).

3) Execution simulation
   - If bid/ask available: buys at ask (conservative) or mid (configurable).
   - If only OHLCV: next bar open + slippage + spread penalty bucketed by premium.

4) Risk controls (defaults)
   - Premium stop: -20% to -30%.
   - Time stop: exit if no favorable move in N minutes.
   - Max loss per day; max trades per day; cooldown after loss.
   - No-hold near close; stricter around expiry days.

5) Validation
   - Walk-forward evaluation (time-ordered splits; avoid leakage).
   - Robustness across stocks, years, regimes.
   - Parameter stability: avoid single-point optima.

## Postgres data model extensions
Minimum tables (extend current schema):
- instruments_snapshot (historical master snapshots).
- option_depth_snapshots (best bid/ask or depth).
- oi_snapshots (options + futures).
- corp_events (financial results, corporate actions).
- macro_bars (USDINR, crude, gold/silver, global index proxy).
- signals, paper_orders, paper_fills, positions (paper broker lifecycle).

Data integrity checks:
- Missing 1-minute candles (generate_series).
- OHLC sanity checks.
- Duplicate timestamps.
- Contract reconstruction (ATM option exists at signal time; skip if missing).

## MVP roadmap (phased)
### Phase 4.1: OHLCV-only backtest (fast iteration)
- Implement: ORB, Supertrend continuation, EMA pullback, Bollinger squeeze.
- Fills: next-minute open + slippage.
- Exits: time stop + ATR trail + premium stop.
- Reports: trade list, equity curve, drawdown, per-regime breakdown.

### Phase 4.2: Paper trading (same code paths)
- Live bars ingestion from WS -> bars_1m.
- Paper broker simulator with positions/PNL.
- Dashboard logs: entry/exit reasons, expected vs actual fill.

### Phase 4.3: Data realism upgrades
- Store bid/ask and depth snapshots.
- Store OI snapshots.
- Add corporate event ingestion.
- Add macro overlays and shock flags.

### Phase 4.4: Strategy selection
- Regime classifier routes to strategy families.
- Parameter stability selection (avoid overfit).
- Optional ML (logistic regression) with strict walk-forward validation.

## References (for implementation guidance)
These are external references supplied by the user and should be consulted during implementation:
- NSE market timings
- NSE F&O pre-open session
- NSE expiry circulars (2025)
- India VIX page + methodology
- NSE corporate filings (financial results, corporate actions)
- SEBI filings hub
- SEBI physical settlement circular
- SmartAPI forum notes (historical candles lack OI; FULL mode includes OI + depth; bid/ask keys)
- SmartAPI instrument master interpretation
- FOMC calendar (macro shock context)

## Guardrails
- No live trading. Paper trading only.
- Buy-only options. No short option selling.
- No advanced strategies until bid/ask + OI snapshots are stable.
