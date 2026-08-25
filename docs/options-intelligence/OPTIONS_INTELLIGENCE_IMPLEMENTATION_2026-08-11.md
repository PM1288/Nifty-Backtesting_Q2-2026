# Options Intelligence implementation and validation

Date: 11 August 2026
Mode: `PAPER` / research only
UI route: `/n50/options/intelligence`
API routes: `/n50/v1/options-intelligence/summary` and `/n50/v1/options-intelligence/candidates/:symbol`

## 1. Intent understood

The workspace is not a generic option-chain viewer. It answers five linked questions:

1. Which members of the complete current stock-F&O universe are historically likely to make a large remaining move?
2. Which of the pre-market names are confirming that movement after the open?
3. Is an actual listed CE + PE structure inexpensive enough to profit from the forecast distribution?
4. Are the quotes, spread, OI, volume, depth, Greeks and timestamps good enough to trust?
5. Why did the engine return `BUY STRADDLE`, `BUY STRANGLE`, `WATCH` or `NO TRADE`?

The system ranks the underlying before the structure. A large-move prediction is not a trade by itself. A recommendation is permitted only when the movement, value, contract-quality, data-quality and risk gates all pass.

## 2. Reference package reviewed

The following files were read in full and the supplied HTML was rendered before implementation:

- `/home/novius2/NIFTY50/Option-Chain-Prediction-UI/Option_Chain_MVP_UI_Implementation_Guide.indy`
- `/home/novius2/NIFTY50/Option-Chain-Prediction-UI/Option_Chain_MVP_UI_Mockup.html`

The mock values were not copied. Its information hierarchy was translated to actual database contracts and the existing light application shell.

## 3. Existing capability retained

The existing `FNO_VOLATILITY_TWO_GATE` service already provides the correct safe computational boundary:

- full active stock-F&O universe from the versioned SmartAPI contract plan;
- completed-session Stage A feature calculation without same-day lookahead;
- transparent per-stock trailing percentile movement scores;
- 15-name pre-market shortlist;
- opening-window gap, range and projected volume pace;
- five-name live shortlist;
- actual expiry and listed-strike discovery;
- ATM straddle, one-step strangle and two-step strangle generation;
- current ask for entry and bid for mark/exit evidence;
- bisection-derived IV and a clearly labelled IV mean-reversion proxy;
- deterministic 5,000-scenario joint return/IV repricing;
- forecast/implied ratio, expected return, probability of profit, P10/P50/P90 and expected shortfall;
- fail-closed `NO_TRADE` on stale, incomplete or economically unattractive structures;
- no live broker order path.

The UI implementation extends this engine. It does not create a competing SmartAPI connection or a second prediction service.

## 4. Actual data verified before implementation

Read-only database inspection on 11 August 2026 showed:

| Evidence | Verified value |
| --- | ---: |
| Archived normalized chain rows | 79,508 |
| Current active stock-F&O underlyings | 186 |
| Current archived expiries | 1 |
| Latest Stage A evaluated names | 185 |
| Latest Stage A shortlist | 15 |
| Latest Stage B evaluated names | 15 |
| Latest Stage B shortlist | 5 |
| Latest trade-ready structures | 0 |

The current `NO_TRADE` state is an evidence-backed result. For example, the last five structure tests failed one or more of forecast/implied edge, expected return, probability of profit or quote freshness. The UI does not manufacture a recommendation to fill an empty state.

## 5. Data lineage

| UI evidence | Authoritative source |
| --- | --- |
| Universe, contract counts and active expiry | `fno_volatility.universe_snapshot` |
| Completed-day features and movement distributions | `fno_volatility.movement_prediction` |
| Decision time, run slot and cutoffs | `fno_volatility.signal_run` |
| Structure and scenario economics | `fno_volatility.option_candidate` |
| Decision and canonical reason codes | `fno_volatility.trade_signal` |
| Current bid/ask, spread, OI, volume, depth and Greeks | `public.smartapi_option_chain_snapshots` |
| F&O engine liveness | `fno_volatility.service_heartbeat` |

All chain rows displayed for one stock are selected from one exact `snapshot_ts`. The current chain cannot silently rewrite the immutable decision snapshot.

## 6. Explainable score contract

The UI computes and exposes bounded scores only from persisted evidence:

- DQS — identity, quote freshness, completeness, sequence/timestamp evidence, sanity and service health.
- MRS — persisted Stage A movement score.
- LCS — persisted Stage B live confirmation score.
- VES — normalized forecast/implied, expected-return, probability-of-profit and direction-entropy evidence.
- CQS — executable spread, two-sided/depth coverage, volume and OI activity.
- Adjusted FRS — `(.20 × MRS + .20 × LCS + .35 × VES + .25 × CQS) × min(1, DQS / 90)`.

Initial gates are:

| Gate | Minimum/maximum |
| --- | ---: |
| DQS | 80 |
| MRS | 55 |
| LCS | 60 |
| VES | 65 |
| CQS | 70 |
| adjusted FRS | 72 |
| P75 forecast / implied move | 1.15× |
| expected net return | 5% |
| probability of profit | 55% |
| direction entropy | 0.90 |
| combined spread | maximum 5% |

These weights explain evidence; they do not override canonical hard failures. A hard rejection remains visible even when a weighted total is high.

## 7. Decision-time versus current monitoring

Two clocks are deliberately separate:

- **Decision snapshot**: the latest coherent chain snapshot at or before `decision_as_of`. DQS, CQS, VES and FRS are computed against this immutable evidence.
- **Current monitor**: the most recent archived chain snapshot for the stock. This drives the price/future chart and detailed current chain, with its own age and quality states.

This prevents an after-close stale quote from changing a valid earlier data-quality judgment and prevents a later price from leaking into an earlier prediction.

## 8. UI delivered

The new sidebar entry `Options Intelligence` opens a dedicated workspace containing:

- paper-only identity and actual-data status;
- decision funnel from 186 names to trade-ready structures;
- data-health and snapshot-age panel;
- four decision KPIs;
- clickable live opportunity ranking;
- selected-stock spot/future monitoring chart;
- score anatomy with visible thresholds;
- executable structure economics;
- graphical CE/PE OI and volume chain;
- selected structure and leg asks;
- detailed current chain with bid, ask, spread, volume, OI, internally derived OI change, IV, Delta, Gamma, Theta, Vega, depth imbalance and quality;
- canonical rejection codes;
- source table and timestamp provenance;
- current rejection pressure;
- view freeze that pauses UI refresh only, never collection.

The old `/options/volatility-signals` route remains available for compatibility.

## 9. Safety behavior

- Every response and the page are labelled `PAPER`.
- There is no live order button or broker-command path.
- Missing model fields render as unavailable rather than zero.
- Stocks outside the five-name structure test set remain `WATCH` and receive no invented premium/P&L.
- Current-chain staleness is explicit after the feed stops.
- Entry economics use asks; valuation uses bids.
- OI change is derived from stored snapshots rather than trusting a vendor percentage.
- Actual contract expiry and strikes come from the database; intervals and expiry weekdays are not hard-coded.

## 10. Verification evidence

Executed:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
npm run typecheck --workspace=@app/api
npm run test --workspace=@app/api
npm run typecheck --workspace=@app/web

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
DEV_LOCAL_AUTH_PASSWORD='<mounted runtime value>' node tools/playwright/options-intelligence-regression.mjs
```

Results:

- API typecheck: pass.
- API tests: 66/66 pass, including three new score/gate tests.
- Web typecheck and production Docker build: pass.
- Playwright: 13/13 checks pass at 1920×1080 and 768×1024.
- Authenticated API responses: no HTTP failures.
- Browser console/page errors: none attributable to the application.
- Warm API latency observed in container logs: summary 61 ms, selected-stock detail 16 ms.
- Deployed container health: healthy.

Screenshots:

- `output/playwright/options-intelligence/options-intelligence-1920x1080.png`
- `output/playwright/options-intelligence/options-intelligence-full.png`
- `output/playwright/options-intelligence/options-intelligence-768x1024.png`

## 11. Known limitations and next evidence milestone

The current model is intentionally named `TRANSPARENT_PERCENTILE_MVP`, not a trained production model. The return and IV layers are transparent proxy models. Promotion beyond paper research requires a growing archive of two-sided entry/exit quotes, walk-forward calibration, conservative transaction costs, outcome labelling and several hundred out-of-sample structure results. Until those acceptance tests pass, `NO_TRADE` remains the safe default and no live-order integration should be added.
