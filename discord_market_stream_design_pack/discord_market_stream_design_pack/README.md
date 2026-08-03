# Discord Market Stream Design Pack

## What this pack is

This pack is a design-first handoff for a backend service that watches your existing NSE/Nifty analytics warehouse, turns raw data into **high-signal market events**, and pushes those events to Discord in a **useful, educational, low-noise** format.

It is built for a workflow where:

- your backend already loads market, option, and derived feature data regularly
- minute cadence is acceptable for live analysis
- Discord should receive only meaningful changes, not a firehose
- every alert should include the numbers behind the claim
- the output must be readable by both people and LLMs
- charts are optional but supported for high-value events

## Core design principles

1. **Event-driven, not stream-every-row**
   - Raw updates may arrive every minute.
   - Discord should receive only candidate events that survive novelty, severity, and confirmation checks.

2. **Deterministic first, LLM second**
   - Market logic, thresholds, dedupe, severity, and routing should be deterministic.
   - The LLM should narrate and explain; it should not decide whether the event is real.

3. **Learning-first output**
   - Every alert should say what changed, why it matters, what confirms it, what contradicts it, and how to read it.

4. **Discord-first formatting**
   - Messages must fit Discord constraints and remain useful even without a chart.
   - Charts should be attached only when they add meaning.

5. **Trust gating**
   - Stale or partial inputs must degrade, suppress, or relabel alerts.

6. **Machine-readable alongside decorated text**
   - Every outbound event should carry a compact machine facts block so another LLM or service can re-analyze it.

## Recommended implementation order

1. Build the **feature freshness + trust gate**
2. Build the **candidate event detectors**
3. Build the **novelty / cooldown / dedupe layer**
4. Build the **narrative renderer**
5. Build the **Discord dispatcher**
6. Build the **chart renderer**
7. Add **daily summaries**, **EOD close summaries**, and **post-close FII context**
8. Add **replay backtests** for event quality and alert-to-noise control

## Your likely data sources from the current warehouse

### Minute / intraday
- `market_minute_feature`
- `market_session_summary`
- `security_minute_feature`
- `stock_intraday_live`
- `vw_latest_market_summary`
- `vw_stock_alpha_latest`
- `option_chain_snapshots`
- `option_chain_legs`
- `option_greeks`
- `pcr_snapshots`
- `max_pain_levels`
- `max_pain_summary`

### Daily / post-close
- `security_daily_features`
- `stock_analysis_signals_daily`
- `signal_performance_summary`
- `fact_corporate_actions`
- `fact_text_events`
- `market_data.nse_event_calendar`
- `market_data.nse_financial_results`
- `market_data.nse_fii_participant_open_interest`
- `market_data.nse_fii_participant_volume`
- `market_data.nse_fii_derivatives_stats`

### Ops / trust
- ingestion job logs
- table freshness
- expected-vs-seen instruments
- missing bars
- parser / connector health

## Files in this pack

- `01-architecture.md`
- `02-event-taxonomy-and-noise-control.md`
- `03-implementation-handoff-prompt.md`
- `04-narration-llm-prompt.md`
- `05-discord-message-spec.md`
- `06-api-contracts.md`
- `07-testing-and-verification.md`
- `08-rollout-ops-security.md`
- `09-integrator-checklist.md`
- `config/.env.example`
- `config/alert-policy.example.yaml`
- `config/discord-layout.example.yaml`
- `schemas/market_event.schema.json`
- `schemas/root_snapshot.schema.json`
- `schemas/discord_embed_payload.schema.json`
- `examples/discord_market_shock_example.md`
- `examples/discord_close_summary_example.md`

## Important note on the Discord test webhook

You provided a Discord webhook URL in chat. I did **not** hardcode it into these files. Treat any webhook URL shared in chat as sensitive. Put it into your local environment or secret manager during testing, then rotate it before production rollout.
