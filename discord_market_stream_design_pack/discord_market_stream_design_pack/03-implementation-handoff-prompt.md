# 03 Implementation Handoff Prompt

Copy the prompt below into your coding agent / engineering handoff as the master instruction set.

---

You are building a production-grade backend service called **market-intel-stream**.

Its purpose is to watch an existing NSE/Nifty analytics warehouse, compute minute-level and daily-level market intelligence, and send only **meaningful, educational, low-noise** alerts to Discord via webhook.

## Product intent

This is not a raw data streamer.
This is an **analyst service**.

It should tell us when:
- the market regime changes
- breadth weakens or strengthens
- volatility expands abnormally
- narrow leadership is masking weakness
- a stock becomes a true leader or a false leader
- options structure confirms or contradicts spot
- max pain / PCR / wall migration matter
- FII / participant data changes the next-session bias
- data quality or APIs are degraded

It must be suitable for:
- a Discord operator feed
- a root HTTP route another LLM can hit
- a learning platform where charts and text explain how to read the signals

## Non-negotiable constraints

1. **Deterministic alert logic**
   - Event detection, thresholds, dedupe, severity, novelty, and trust gating must be deterministic.
   - An LLM may narrate the event, but must not decide if the event exists.

2. **No spam**
   - The service must use novelty scoring, cooldowns, suppression, and batching.
   - The service must not send every minute update just because data changed.

3. **Numerically grounded output**
   - Every conclusion must cite actual metrics.
   - Never send generic phrases like “market is bullish” without the numbers.

4. **Trust-aware**
   - If a source is stale or partial, downgrade or suppress that module’s claims.
   - The service must surface data-quality incidents.

5. **Discord-first formatting**
   - Messages must remain readable inside Discord without opening another dashboard.
   - Optional charts may be attached, but the text must stand on its own.

6. **LLM-readable root output**
   - The `/` route must return a decorated narrative plus a machine facts block.

## Existing backend data to use

Assume the warehouse already contains tables/views equivalent to:

### Intraday
- market_minute_feature
- market_session_summary
- security_minute_feature
- stock_intraday_live
- vw_latest_market_summary
- vw_stock_alpha_latest
- option_chain_snapshots
- option_chain_legs
- option_greeks
- pcr_snapshots
- max_pain_levels
- max_pain_summary

### Daily / post-close
- security_daily_features
- stock_analysis_signals_daily
- signal_performance_summary
- fact_corporate_actions
- fact_text_events
- market_data.nse_event_calendar
- market_data.nse_financial_results
- market_data.nse_fii_participant_open_interest
- market_data.nse_fii_participant_volume
- market_data.nse_fii_derivatives_stats

### Ops
- ingestion logs
- freshness tables
- expected-vs-seen counts
- missing bars reports
- parser health / connector health

## Build the system with these services

1. **feature-service**
   - computes normalized market, stock, options, FII, quality, and digest features

2. **alert-engine**
   - creates candidate events
   - scores severity
   - computes novelty
   - applies confirmation logic
   - applies cooldown / dedupe / suppression

3. **render-service**
   - turns approved events into:
     - decorated Discord text
     - embeds
     - optional chart request
     - LLM brief
     - machine facts block

4. **chart-service**
   - renders PNG charts for high-value events only

5. **dispatch-service**
   - sends messages to Discord webhook
   - handles retries / rate limits / delivery tracking

6. **api-service**
   - exposes:
     - `/`
     - `/api/stream/now`
     - `/api/events/recent`
     - `/api/events/{id}`
     - `/api/quality`
     - `/api/dispatch/preview`
     - `/api/dispatch/test`
     - `/health`

## Build requirements

### Feature requirements
Compute, at minimum:

#### Market
- last
- change %
- gap %
- intraday range %
- breadth up/down
- breadth above VWAP %
- weighted participation %
- top-10 concentration %
- realized intraday volatility
- session drawdown
- session recovery
- regime label

#### Stocks
- last
- change %
- daily RSI14
- intraday RSI14
- VWAP deviation %
- volume ratio
- residual return vs index
- relative strength persistence
- continuation score
- reversal score
- mean-reversion score
- signal state
- entry style
- risk flag

#### Options
- spot
- weekly max pain
- monthly max pain
- weekly PCR
- monthly PCR
- ATM IV
- dominant call wall
- dominant put wall
- wall migration
- options bias

#### FII / participant
- FII index futures long %
- FII stock futures long %
- client long %
- prop long %
- change vs prior
- percentile vs rolling history
- regime interpretation

#### Quality
- freshness per module
- coverage ratio
- missing bars
- stale-source flags
- stale-module suppression

## Event detectors to implement

At minimum:
- broad participation trend confirmation
- narrow leadership warning
- breadth failure
- volatility shock
- failed open
- late-day reversal
- stock true leader
- stock false leader
- stock breakdown
- stock reversal
- sector rotation
- options wall migration
- max pain pin risk
- options confirm / contradict spot
- FII regime shift
- source stale
- parser failure
- missing bars

## Discord output rules

Each approved event must produce:
- title
- severity
- decorated body
- key numbers
- why it matters
- what confirms it
- what contradicts it
- what would invalidate it
- learner note
- machine facts block
- chart attachment request yes/no

Messages must support:
- compact event messages
- digest messages
- open summary
- close summary
- post-close FII / institutional summary
- data-quality alerts

## Root route rules

The `/` route must return a **market dossier** with:
- decorated header
- market headline
- key conclusions
- index snapshot
- options snapshot
- FII snapshot
- sector snapshot
- full stock snapshot
- best entries
- risk flags
- next alerts
- how to read today
- data quality
- llm_brief
- machine_facts

The root route must include actual values for:
- index values and change %
- breadth
- weighted participation
- top-10 concentration
- RSI
- max pain
- PCR
- FII long %
- top leaders / laggards

## Discord message design requirements

Implement:
- content-safe markdown
- message size budgets
- embed layout
- optional chart attachment
- compact code-block machine facts section

Avoid:
- table spam too wide for Discord
- raw JSON dumps in visible text
- noisy low-value repetition
- casual wording with no numbers

## Security requirements

- use env var or secret manager for webhook URLs
- never hardcode webhook URLs
- redact secrets from logs
- support separate test and prod webhooks
- allow dry-run mode and preview mode
- maintain a sent-message audit trail

## Testing requirements

Build:
- unit tests for each detector
- contract tests for schemas
- replay tests from historical minute data
- message rendering tests for Discord size limits
- chart rendering tests
- delivery tests with test webhook
- quality gate tests
- shadow-mode tests
- canary rollout support

## Acceptance criteria

The system is complete when:
- it can run in shadow mode without sending
- it can produce a stable root route
- it emits meaningful candidate events during replay
- duplicates are suppressed
- data-quality incidents are surfaced
- Discord messages are readable and under limits
- the service can be verified end-to-end in staging
- there is a clear ops runbook

## Deliverables to generate

Produce:
1. architecture docs
2. config templates
3. event taxonomy
4. API contracts
5. prompt files for narrator
6. prompt files for learner explanations
7. testing plan
8. rollout plan
9. ops/security checklist

Be explicit. Do not leave hand-wavy gaps. Treat this like a production handoff.
