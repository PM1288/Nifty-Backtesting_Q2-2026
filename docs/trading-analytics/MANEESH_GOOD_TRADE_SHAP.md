# MANEESH V7 Good-Trade SHAP Research

## Purpose

This is a research-only explanation layer beside the existing MANEESH paired EMA9 strategy. It does not alter signal generation, entry rules, paper orders, notifications, or execution permissions.

Dashboard: `/n50/strategy/nifty-context?lens=trade-quality`

API:

- `GET /v1/nifty-context/trade-quality`
- `GET /v1/nifty-context/trade-quality/export/{run_id}`

Worker command:

```bash
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/nifty-context.yml \
  run --rm nifty-context python worker.py trade-experiment
```

The long-running worker runs the idempotent experiment once at or after 16:00
IST each trading day. A durable run lookup prevents a restart from duplicating
the date; a restart later that day catches up a missed 16:00 run.

## Population and outcome

Population: every stored observation produced by `FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7`. No winning-only sample is used. Positive, non-positive and unavailable outcomes remain separately visible.

Versioned experiment: `MANEESH_V7_GOOD_TRADE_SHAP_2_DAILY_30D`.

Versioned label: `GOOD_TRADE_NET_POSITIVE_15M_ZERODHA_20260909_ONE_LOT`.

For the exact selected option (CE for CALL, PE for PUT):

```text
gross = (stored 15-minute endpoint premium - stored entry-open premium) * one exact-contract lot
net   = gross - versioned NSE option charges
GOOD_TRADE = net > 0
```

Charge policy: `ZERODHA_NSE_OPTIONS_CALCULATOR_20260909`.

This is quote-path research, not booked or guaranteed executable P&L. Lot size comes from the current exact contract master and is explicitly marked non-historical. Future work must retain effective-dated lot sizes before this can be presented as historical execution truth.

## Feature boundary

Every run selects signals from the latest 30 calendar days, inclusive of its
IST as-of date. Only evidence known at entry is eligible as a model input:

- interval and CALL/PUT direction;
- strike distance;
- underlying and selected-option body fractions;
- EMA distance and next-open gap for underlying and selected option;
- entry-time RSI14, MACD, signal and histogram for underlying, selected option and opposite option;
- prior-candle red/green counts as optional context;
- the stored V7 body and next-open condition results;
- mean signed open/close distance from EMA9 across the two required precursor
  candles for the underlying and selected option.

The complete original condition and indicator JSON remains exportable. Stored 15-minute, 30-minute and EOD max/min/endpoint paths are outcomes only. They are never input features, preventing look-ahead leakage.

Missing input values remain null. Rows remain visible in evidence but are excluded from model fitting; they are never zero-imputed.

## Model and SHAP gate

- chronological split by complete decision-time groups, so simultaneous stock
  setups cannot straddle training and test;
- final 20% of complete labelled trades held out, with a minimum five rows;
- every retained training label must mature before the first held-out entry;
- minimum 20 complete labelled observations overall;
- minimum 12 training observations and both labels;
- regularised logistic baseline;
- small CPU XGBoost binary classifier;
- TreeExplainer with interventional background;
- SHAP reconciliation tolerance `1e-4`;
- contribution units are raw binary log-odds margin, not probability percentage points;
- no threshold search, execution promotion or notification use.

There is no longer a 20-session eligibility gate. This permits the daily model
to mature from the many exact-option setups already captured. Trades within one
session are correlated rather than independent, so the dashboard and export
continue to label the result `EXPLORATORY`; it is not approved for order entry.

The dashboard shows the full outcomes table even when the model gate is not
met. Once eligible, it shows a genuine daily mean-absolute SHAP importance
chart across held-out trades and a signed waterfall for a selected held-out
trade. Neither chart uses synthetic or future-outcome features.

The primary table compares both exact legs irrespective of the original direction. CE and PE each show 15-minute, 30-minute and EOD net P&L, gross P&L, charges, endpoint premium and the observed high/low excursion. The original selected leg remains explicit and alone determines the versioned good-trade label. Selecting anywhere on a row opens the unchanged complete evidence inspector.

## Superseded V1 evidence — 9 September 2026

| Measure | Value |
|---|---:|
| Stored observations | 55 |
| Mature EOD outcomes | 55 |
| Positive-net label | 24 |
| Non-positive-net label | 31 |
| Complete model-input rows | 38 |
| Independent sessions | 1 |
| State | `DATA_INSUFFICIENT` |

Reason: `Need 20 complete independent sessions; have 1`.

This records why V1 showed no chart. V2 intentionally replaces that session
gate with the trade-level gate above and changes the label horizon from EOD to
15 minutes. It does not rewrite any stored V1 run.

## Persistence

Additive tables:

- `nifty_context.trade_quality_runs`
- `nifty_context.trade_quality_examples`
- `nifty_context.trade_quality_predictions`

Inputs are read from `nse_ops.scalper_entry_signal` and `nse_ops.scalper_trade_observation`; they are never updated by this module.

## Validation and rollback

Synthetic tests cover charge arithmetic, the exact 15-minute label, positive
and non-positive labels, missingness, outcome leakage, the 30-day boundary,
single-session multi-trade eligibility, scheduler timing/idempotency and SHAP
reconciliation. The separate hourly NIFTY model retains its own independent
20-session research gate.

```bash
docker run --rm \
  -v /home/novius2/trading-stack/services/nifty_explainable:/tests:ro \
  -e PYTHONPATH=/app -w /tests \
  trading-stack-novius2-nifty-context:latest \
  python -m unittest -v test_worker.py test_trade_quality.py
```

Roll back the dashboard and worker images to their prior immutable image digests. The additive tables may safely remain because execution code never references them.

## Production synchronization — 9 September 2026

The dashboard and SHAP worker were rebuilt from canonical master. The worker
then produced trade-quality run
`4ac5f1c496d9f3ed9e881249c74c59de048edc458988e9f9d4cee5f96fae1a9d`.
Every returned trade row contains CE and PE comparative outcomes for 15m, 30m
and EOD; a strengthened browser contract verifies those payload keys on all
rows and requires at least one observed numeric net result.

The live state is still `DATA_INSUFFICIENT`, intentionally: 55 observations,
38 complete feature rows and 1 independent session. The UI therefore shows the
outcomes and gate reason but no fake SHAP waterfall. Authenticated deployed
browser verification passed 114/114 checks; evidence is at
`output/playwright/nifty-context-deployed-v2/`.

The Good-trade SHAP lens includes a dedicated chart-status panel whenever the
trade-level model gate is locked. Once genuine held-out explanations exist, the
same lens renders the actual per-trade waterfall; it never substitutes an
outcome chart or synthetic importance bars.

## Daily V2 production synchronization — 10 September 2026

Canonical application commit `0079da71161818ddd4d2409e85563069d8dfb526`
was pushed to `master` and deployed to the dashboard and isolated context
worker. A read-only live-data fit found 135 rolling-window observations, 131
mature 15-minute labels, 65 positive and 66 non-positive outcomes, 86 complete
feature rows, 63 training rows and 18 held-out predictions. SHAP reconciliation
error was `3.387164687618238e-07`.

Because the current time was before the day's scheduled run, the deployment
backfilled the missing 9 September daily V2 run instead of prematurely marking
10 September complete. Run
`feb36d701b6793e4909e6cfc58a9caae229c7f12500d825fe85672524bdafdd8`
contains 55 observations, 38 complete inputs and eight genuine held-out SHAP
explanations. The scheduler's live durable-state check reports false at 15:59
IST and true at 16:00 IST for 10 September, so the normal 10 September run
remains due.

Authenticated deployed-browser verification passed 114/114 checks at 1920,
1440 and 390 CSS pixels. Evidence is intentionally ignored at
`output/playwright/nifty-context-daily-shap-20260910-final/`.
