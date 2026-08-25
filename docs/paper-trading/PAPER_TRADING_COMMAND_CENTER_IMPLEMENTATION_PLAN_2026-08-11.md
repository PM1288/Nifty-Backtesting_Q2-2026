# Paper Trading Command Center — implementation plan

Date: 11 August 2026
Reference: `/home/novius2/NIFTY50/Paper-Trade-UI`
Production route: `/paper-trading`

Implementation status: **deployed and browser-verified on 11 August 2026**. The immediate read model, +0.4% default target, versioned policy record, command-center UI, drill-down API, manual PAPER modal, standalone prototype and automated checks are complete. The durable clock-specific extrema enhancements listed below remain the next additive evaluator version; the current UI truthfully uses the existing observation/horizon records and does not invent unavailable timestamps.

## Product intent

Paper trading is a signal-quality observation system with an execution ledger attached. It is not merely an open-position list.

Every filled paper entry creates two independent truths:

1. **Execution truth** — fills, open quantity, current mark, realised/unrealised P&L, costs, actual close and execution status.
2. **Analytical truth** — the original entry continues to be observed after execution close to establish reward, pain, speed and persistence.

The dashboard must answer:

- Did the signal create useful upside and how quickly?
- What was the worst entry-relative adverse excursion?
- Did reward occur before or after excessive pain?
- How much observed opportunity did execution capture?
- Was the trade analytically good, mixed, bad, at risk or still developing?
- Is the evidence complete, partial, stale, corrected or ambiguous inside an OHLC bar?

Actual P&L must never be called analytical potential. MFE/MAE potential must never be called realised P&L.

## Evaluation clocks

| Clock | Eligible window | Required results |
| --- | --- | --- |
| Intraday D0 | weighted-average fill to entry-session close | +0.3%, +0.4%, +0.5%, +1%; first-hit minutes; D0 MFE/MAE; partial-session state |
| Swing | D+1 through D+5 | +1%, +3%, +5%; first-hit trading day/time; swing MFE/MAE |
| Short horizon | Entry through D+5 close | MFE, MAE, extreme times/days, reward-to-pain and chronology |
| Long horizon | Entry through D+30 close | same metrics through D+30; continues after execution close |

`D+n` always means the nth valid exchange trading session, not a calendar day.

Long favourable evidence is bar high and adverse evidence is bar low. Short favourable evidence is bar low and adverse evidence is bar high. A target and adverse breach inside the same bar are `UNKNOWN_WITHIN_BAR` unless a finer ordered source resolves them.

## Explainable quality policy

The initial five-session grade is versioned:

- `EXCELLENT`: mature 5D MFE at least +5% and MAE better than −2%.
- `GOOD`: mature 5D MFE at least +1% and MAE better than −2%.
- `MIXED`: mature reward at least +1%, but MAE breached −2%.
- `BAD`: mature reward below +1% and MAE breached −2%.
- `WEAK`: mature reward below +1%, but MAE remained better than −2%.
- `AT_RISK`: immature window and MAE breached −2%.
- `DEVELOPING`: immature window without the adverse breach.
- `DATA_INCOMPLETE` and `CENSORED`: explicit evidence states, never converted to failure.

Execution outcome remains independently classified as open profit/loss, closed profit/loss or breakeven.

## Existing architecture reused

The repository already provides most durable primitives:

- paper-only trade intents, groups, legs, orders, fills and positions;
- independent `target_definitions`, `target_tracks` and first-hit `target_hits`;
- `observation_trackers` that continue after actual close;
- 5- and 30-session `horizon_outcomes`;
- immutable `trade_events`, valuation snapshots and webhook outbox;
- market-bar cursors and idempotent processed-bar records;
- PostgreSQL monitor worker reading `public.bars_1m`;
- a PAPER-only authenticated manual-entry adapter.

The implementation must extend these records; it must not create a parallel paper ledger or replace them with browser state.

## Required backend uplift

### Immediate read-model uplift

1. Return every filled equity position, including closed execution positions whose observation remains active.
2. Join target state, first-hit time, elapsed time and all 5/30-session outcomes in one bounded query.
3. Return execution P&L separately from analytical MFE/MAE and target potential.
4. Project quality grade, explainable score components, maturity and coverage.
5. Return aggregate target conversion with correct eligible denominators.
6. Return adverse-breach counts without treating immature targets as misses.
7. Provide one trade-detail endpoint with journey series, targets, evidence and immutable audit events.
8. Use the existing bar store for chart series and cap/downsample the response.

### Durable calculation uplift

1. Add +0.4% to the default intraday ladder without modifying historical target-hit rows.
2. Bind trades to an immutable evaluation-policy version. New policy versions create new rows.
3. Persist distinct D0, swing, D+5 and D+30 extrema with price, event time, source bar and session index.
4. Persist adverse threshold first-breach events at configurable levels.
5. Persist coverage state and same-bar ordering confidence.
6. Reconcile D0 after close and all active horizons nightly from canonical bars.
7. Recompute corrected bars idempotently and publish a correction audit event.
8. Preserve continued observation after partial or full execution close.

### Realtime uplift

1. REST snapshot first; sequenced paper deltas afterward.
2. Coalesce mark updates for rendering, but never drop target, adverse, fill, grade, correction or maturity events.
3. On sequence gap, mark the UI recovering and fetch a new snapshot.
4. Carry trade, instrument, strategy, policy, source event, calculation version and correlation identifiers.

## Dashboard information architecture

The first 1080px viewport must contain:

1. PAPER/data-state context.
2. Executive question: “Did the trade work—and how much pain did it require?”
3. Quality verdict and score with mature sample count.
4. Good, mixed, bad/risk and developing counts.
5. Actual execution P&L versus analytical upside/downside and capture efficiency.
6. Four horizon cards.
7. The start of reward-vs-pain evidence.

The rest of the page contains:

- reward-vs-pain atlas with Intraday/5D/30D lenses;
- complete target conversion and adverse ladders;
- complete trade horizon matrix with sticky headers;
- search, state and outcome filters plus explicit sorts;
- add-paper-trade dialog rather than a dominant inline form;
- right-side detail drawer with Journey, Targets, Evidence and Audit tabs.

Empty charts and zero-card grids are prohibited. An empty portfolio uses one focused call to action.

## Trade detail

### Journey

- entry-normalised series;
- entry, +1%, +3%, +5% and −2% lines;
- actual result, maximum potential, downside and capture efficiency;
- four clock summaries;
- deterministic interpretation.

### Targets

- all favourable targets, states, prices and first-hit times/days;
- adverse thresholds and first breaches;
- pending versus mature-missed distinction;
- path-order ambiguity.

### Evidence

- source table/resolution;
- source/event/receive times;
- coverage and latest processed bar;
- policy/calculation version;
- correction and corporate-action state.

### Audit

- accepted intent, fill, mark, target, close, horizon, webhook and correction events in event order.

## Safety

- The browser receives no service or SmartAPI credential.
- Manual creation remains authenticated and CSRF-protected.
- The adapter sends `environment=PAPER`; the paper API rejects LIVE.
- No dashboard action imports or calls a broker order adapter.
- Closing execution and stopping observation are separate concepts.

## Implementation sequence

1. Characterise existing schema, rows, calculations and current UI.
2. Preserve the current page/API behaviour in focused tests.
3. Add the read-model projection and trade-detail endpoint.
4. Add +0.4% to the new default policy and an additive migration/backfill for active observations.
5. Implement premium reusable React sections and the detail drawer.
6. Keep the manual PAPER entry in a modal/dialog.
7. Produce a standalone synthetic HTML prototype independent of production paths.
8. Add API/unit tests for classification, separation and maturity.
9. Add Playwright tests for executive summary, all targets, filters, drawer tabs, keyboard access, motion preference and responsive sizes.
10. Build and deploy only the dashboard and paper services required by changed code.
11. Compare pre/post PostgreSQL counts and confirm no historical loss.
12. Record remaining evaluator/realtime limitations honestly.

## Definition of done

- Existing paper rows and audit history remain intact.
- The UI shows all trades rather than only open positions.
- Intraday +0.3/+0.4/+0.5/+1 and swing +1/+3/+5 are explicit.
- D0, swing, 5D and 30D reward/pain are distinct.
- Closed execution can remain under observation.
- Actual P&L and analytical potential are separate in API and UI.
- Every row opens Journey, Targets, Evidence and Audit.
- A deterministic standalone demo demonstrates good, mixed, bad, developing, post-exit-success and ambiguous paths.
- Type checks, paper tests, API tests, Playwright desktop/responsive checks and deployed health all pass.
- No live order is placed.
