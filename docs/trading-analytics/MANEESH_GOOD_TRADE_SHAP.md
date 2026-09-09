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

The long-running worker also runs the idempotent experiment once after 16:00 IST each trading day.

## Population and outcome

Population: every stored observation produced by `FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7`. No winning-only sample is used. Positive, non-positive and unavailable outcomes remain separately visible.

Versioned label: `GOOD_TRADE_NET_POSITIVE_EOD_ZERODHA_20260909_ONE_LOT`.

For the exact selected option (CE for CALL, PE for PUT):

```text
gross = (stored EOD endpoint premium - stored entry-open premium) * one exact-contract lot
net   = gross - versioned NSE option charges
GOOD_TRADE = net > 0
```

Charge policy: `ZERODHA_NSE_OPTIONS_CALCULATOR_20260909`.

This is quote-path research, not booked or guaranteed executable P&L. Lot size comes from the current exact contract master and is explicitly marked non-historical. Future work must retain effective-dated lot sizes before this can be presented as historical execution truth.

## Feature boundary

Only evidence known at entry is eligible as a model input:

- interval and CALL/PUT direction;
- strike distance;
- underlying and selected-option body fractions;
- EMA distance and next-open gap for underlying and selected option;
- entry-time RSI14, MACD, signal and histogram for underlying, selected option and opposite option;
- prior-candle colour counts as optional context.

The complete original condition and indicator JSON remains exportable. Stored 15-minute, 30-minute and EOD max/min/endpoint paths are outcomes only. They are never input features, preventing look-ahead leakage.

Missing input values remain null. Rows remain visible in evidence but are excluded from model fitting; they are never zero-imputed.

## Model and SHAP gate

- chronological split by trading session;
- last five eligible sessions held out;
- minimum 20 complete independent sessions;
- minimum 100 training observations and both labels;
- regularised logistic baseline;
- small CPU XGBoost binary classifier;
- TreeExplainer with interventional background;
- SHAP reconciliation tolerance `1e-4`;
- contribution units are raw binary log-odds margin, not probability percentage points;
- no threshold search, execution promotion or notification use.

The dashboard shows the full outcomes table even when the model gate is not met. It shows a waterfall only for genuine held-out predictions.

The primary table compares both exact legs irrespective of the original direction. CE and PE each show 15-minute, 30-minute and EOD net P&L, gross P&L, charges, endpoint premium and the observed high/low excursion. The original selected leg remains explicit and alone determines the versioned good-trade label. Selecting anywhere on a row opens the unchanged complete evidence inspector.

## Initial live evidence — 9 September 2026

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

No SHAP values or predictive probabilities were fabricated from this one-session sample. Daily accumulation and the after-close runner will make the model eligible only after the frozen minimum is genuinely reached.

## Persistence

Additive tables:

- `nifty_context.trade_quality_runs`
- `nifty_context.trade_quality_examples`
- `nifty_context.trade_quality_predictions`

Inputs are read from `nse_ops.scalper_entry_signal` and `nse_ops.scalper_trade_observation`; they are never updated by this module.

## Validation and rollback

Synthetic tests cover charge arithmetic, positive and non-positive labels, missingness, outcome leakage, minimum-session abstention and the pre-existing NIFTY SHAP reconciliation suite.

```bash
docker run --rm \
  -v /home/novius2/trading-stack/services/nifty_explainable:/tests:ro \
  -e PYTHONPATH=/app -w /tests \
  trading-stack-novius2-nifty-context:latest \
  python -m unittest -v test_worker.py test_trade_quality.py
```

Roll back the dashboard and worker images to their prior immutable image digests. The additive tables may safely remain because execution code never references them.
