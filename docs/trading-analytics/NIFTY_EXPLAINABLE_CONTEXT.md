# NIFTY Explainable Context — isolated research dashboards

## Scope and safety

This is an additive research module, not an EMA9 replacement, signal gate,
paper-trade adapter or WhatsApp producer. No existing strategy, collector, source
precedence, OHLC record, user permission, paper ledger or chart is rewritten.

Route: `/n50/strategy/nifty-context`. URL `lens=direction|range|validation|audit`;
`prediction=<id>` and `class=DOWN|SMALL|UP` retain selection and browser history.
The Strategy menu exposes **NIFTY Model Research**. The existing MANEESH terminal
is linked, not embedded or changed. Only the selected dashboard mounts.

## Critical audit findings — 9 September 2026

- Source is canonical PostgreSQL, not the UI's 400-row display response.
- Underlying is `public.bars_1m`, NSE token `99926000`, using the canonical
  `public.trading_calendar` open and close timestamps.
- Initial audit: approximately 13,720 retained minute rows across 28 sessions,
  3 August through 9 September. Counts are captured exactly in each run, not
  hard-coded in the dashboard. This is a small engineering sample.
- `internal/store/postgres.go:UpsertBars` changes OHLC on conflict without
  refreshing `created_at` or keeping revisions. Original collection time alone
  does NOT prove what historical values were known then. All historical model
  results are therefore `EXPLORATORY_REVISION_UNVERIFIED`.
- SmartAPI equity option-chain history does not contain an underlying named
  NIFTY; do not infer absence of index data from that table alone. Greek history
  uses `NIFTY50` (initial audit 11,073 records, 10 August–9 September), not `NIFTY`.
  `option_greeks` has one timestamp and upserts values; separately proving
  publication/availability/revision time is still necessary.
- Quote history exposes exchange feed time and collection time. OI eligibility
  additionally requires a fixed exact-contract cohort and valid baselines.
  Existing deterministic PCR/OI calculations remain unchanged. No unqualified
  OI or IV join is smuggled into the initial models.
- Institutional cash data without proven publication/observation time is
  excluded; missing institutional context is not zero.

## Frozen experiment 1

Declared before examining held-out performance; no hyperparameter search:

1. Cutoffs: 10:17, 11:17, 12:17, 13:17, 14:17 IST for a normal 09:15 session.
   Inputs end two minutes earlier, allowing normal collector finalisation.
   Calendar anchoring, not a device timezone, determines these times.
2. Input coverage: every minute from session open through the anchor must be
   present, finite, coherent OHLC and collected by that example's own cutoff.
   No forward filling, zero substitution or incomplete-session extrema.
3. Target: log(close of next 60-minute window / open at cutoff). UP above
   +0.0015, DOWN below -0.0015, otherwise SMALL. All three probabilities shown.
4. Range target: max high minus min low in the same 60-minute window; index
   points, not implied upper/lower stock prices or executable profit.
5. Nine price/session features: 5/15/30-minute log returns, EMA9 distance and
   slope, 30-minute return volatility, 30-minute relative range, session-range
   location, minutes since open. EMA uses a session SMA9 seed; it is a research
   feature, NOT a reimplementation or modification of the trading EMA rule.
6. Minimum 20 eligible distinct sessions and 40 training occasions, all three
   training classes. Final five sessions held out chronologically. Training
   labels must end AND have been available before the first test decision.
   No random split, per-strike pseudoreplication, tuning or automatic promotion.
7. Direction: training class-frequency baseline; scaled logistic (C=.5);
   XGBoost CPU (40 trees, depth 2, rate .05). Seed 42.
8. Range: training time-of-day median benchmark; three gradient-boosted quantile
   regressors q=.1/.5/.9, 40 trees, depth 2, seed 42. If a training time bin is
   absent, benchmark uses the overall training median. Crossings are counted,
   not silently sorted away.
9. Versioned training-only background, at most 100 evenly sampled training rows.
   TreeExplainer interventional; LinearExplainer checks the scaled benchmark.
10. Numerical additivity must pass at 1e-4 for classifier, linear benchmark and
    median range, otherwise no result is saved as successful.

Direction waterfalls show **raw multiclass margins**, not percentage-point
contributions. Predicted probabilities are uncalibrated. Range SHAP uses index
points. Chronological family heatmaps contain only actual saved predictions;
no hourly-to-five-minute interpolation. Reference and model identities are
exported. SHAP explains models, not causation or guaranteed trading edge.

## Data architecture

`services/nifty_explainable` is a CPU-only Python worker. It reads existing
market tables and writes only additive `nifty_context` tables:

| Table | Preserved evidence |
|---|---|
| runs | frozen config, worker SHA, commit, packages, coverage, gaps, evaluation |
| models | parameters, background, logistic coefficients/scaler, XGBoost JSON, quantile artifact |
| snapshots | immutable feature values and exact source rows, cutoff/collection bounds |
| run_snapshots | every training/test snapshot associated with a run |
| predictions | original cutoff/window, probabilities/range, model and snapshot identities |
| explanations | feature values/order, base, contributions, output units, background ID |
| evaluations | held-out metrics and numerical reconciliation |

Insert-only IDs and transactions make reruns idempotent for an identical
worker/config/input/label snapshot. Quantile artifacts are trusted local Python
pickles encoded for transport; NEVER load user-supplied pickle. This release
does not expose an artifact-upload or arbitrary model-loading endpoint.

Existing authenticated Node API serves GET `/v1/nifty-context` and
GET `/v1/nifty-context/export/:run`. Invalid IDs fail 400; absent exports 404;
storage failure 503 with a safe code, never a DSN or raw stack trace. Export
includes all training/test inputs, model artifacts, raw values, labels and
explanations, independently of visible rows. No mutation endpoint exists.

Capture-loop observes the calendar every 30 seconds but reads the large minute
table only during the five scheduled capture windows. It never backdates a
missed capture. Snapshots record actual capture time. Capture is separate from
retraining. This first release does not automatically approve/retrain a model
or issue live forecasts from an unqualified historical run.

## Deployment and rollback

Only deploy pushed canonical `master`, after required repository gates:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/nifty-context.yml build nifty-context
NIFTY_CONTEXT_COMMIT=$(git rev-parse HEAD) docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/nifty-context.yml run --rm --no-deps nifty-context python worker.py experiment
NIFTY_CONTEXT_COMMIT=$(git rev-parse HEAD) docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/nifty-context.yml up -d --no-deps nifty-context
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard
```

No new public port, broker connection, GPU, external LLM or notification service.
Worker is limited to one CPU and 1 GiB. Existing environment provides the DSN;
never copy secrets into commands or documentation. No historical source deletes.

Disable capture with `NIFTY_CONTEXT_ENABLED=false` in its compose environment
and recreate only `nifty-context`. The API also honours this flag when supplied
to `n50-dashboard`. Revert the additive UI commit / prior dashboard image for
full navigation rollback. Retain the research schema for evidence; no DROP is
required. New snapshots are only a few small NIFTY records per session, not an
unbounded option-chain clone. Long-term research retention needs an explicit
evidence policy before expanding symbols/features.

## Remaining research gates (not claimed complete)

- Historical source revision provenance is unverified; do not call this a
  certified point-in-time backtest or trade recommendation.
- Prospective capture must accumulate eligible sessions; no immediate evidence
  of 20-session forward performance can be created in one deployment.
- OI/IV feature ablations, timestamp-qualified morning model, episode-level EMA9
  follow-through and exact-option bid/ask profit models are separate gated
  experiments, not fake panels populated with substitutes.
- Multi-fold walk-forward stability, clustered uncertainty, calibrated pipeline
  explanations, and automatic live model selection require a larger qualified
  sample. Current final holdout is an engineering diagnostic, not an endlessly
  reusable optimisation target.
- Neither the range estimate nor directional accuracy is paper-trading P&L.

Methodology: [TreeExplainer](https://shap.readthedocs.io/en/latest/generated/shap.TreeExplainer.html),
[LinearExplainer](https://shap.readthedocs.io/en/latest/generated/shap.LinearExplainer.html).
SHAP is MIT-licensed; installed distribution notices remain in the image.
