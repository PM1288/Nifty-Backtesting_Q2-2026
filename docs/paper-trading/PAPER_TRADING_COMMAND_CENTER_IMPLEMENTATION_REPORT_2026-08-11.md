# Paper Trading Command Center — implementation report

Date: 11 August 2026
Deployment: `/home/novius2/trading-stack`
Production route: `http://127.0.0.1:19090/n50/paper-trading`
Mode: `PAPER` only

## Outcome

The former open-position page is now a paper-signal evaluation command center. It shows every filled equity paper trade—including an execution that has already closed—while preserving the distinction between:

- actual fills, position state and realised/unrealised P&L;
- analytical targets, maximum favourable excursion, maximum adverse excursion and horizon outcomes.

The page answers the product question: **Did the trade work, how quickly, and how much pain did it require?**

No broker adapter was added or called. Manual creation remains an authenticated, CSRF-protected PAPER intent sent to the existing paper service.

## Implemented experience

### Executive view

- Versioned signal-quality verdict and explainable score.
- Good, mixed, bad/risk and developing counts.
- Mature sample count so incomplete windows are not presented as final outcomes.
- Actual execution P&L shown separately from analytical maximum upside and observed downside.
- Opportunity-capture efficiency clearly labelled as a comparison, not realised potential.
- PAPER-only identity and observation-through-D+30 context.

### Four clocks

1. Intraday D0: +0.3%, +0.4%, +0.5% and +1%.
2. Swing D+1 through D+5: +1%, +3% and +5%.
3. Short horizon D+5: MFE, MAE and closing evidence.
4. Long horizon D+30: MFE, MAE and closing evidence after execution close.

### Portfolio evidence

- Reward-versus-pain atlas with Intraday, 5D and 30D lenses.
- Target conversion uses eligible observations as its denominator.
- Adverse-excursion breach ladder.
- Complete sticky horizon matrix with actual P&L, all seven favourable targets, 5D/30D reward and pain, observation coverage and execution outcome.
- Symbol/strategy search, outcome filters and explicit quality/newest/MFE/MAE/P&L sorts.
- Command-bar anchors and Ctrl/Cmd+K matrix search.
- Responsive layout and calm-motion mode.

### Trade detail

Every matrix row opens a drawer containing:

- Journey: entry-normalised one-minute market path and actual-versus-potential KPIs.
- Targets: favourable target state, target price, first-hit evidence and chronology.
- Evidence: canonical table, resolution, coverage, calculation version and within-bar policy.
- Audit: immutable business-event sequence.

The drawer now fails visibly and safely if its evidence endpoint fails; it cannot crash the whole dashboard.

### Manual paper entry

The large inline form was replaced with a focused modal. It creates an equity PAPER observation using the existing protected API adapter and starts the standard target/horizon policy. It cannot create a broker order.

## Backend and database changes

### Read API

`GET /v1/workspace/paper-trading`

- includes all filled equity positions, not only open positions;
- includes closed execution positions still useful for observation;
- returns target and horizon evidence;
- projects maturity, grade, score components, 5D/30D MFE/MAE and execution outcome;
- returns target-conversion aggregates;
- keeps actual P&L and analytical potential in different fields.

`GET /v1/workspace/paper-trading/trades/:tradeGroupId`

- UUID validated;
- equity-paper scoped;
- bounded to 1,500 one-minute bars;
- returns normalized journey, targets, horizons, evidence and immutable audit events;
- serializes PostgreSQL bigint values explicitly for safe JSON output.

### Evaluator policy

New trades that request default ladders now receive:

- intraday: `0.003`, `0.004`, `0.005`, `0.010`;
- swing: `0.010`, `0.030`, `0.050`.

Custom strategies with `apply_default_ladders=false` remain unchanged. The policy helper is shared by atomic and incrementally assembled groups.

### Migration 005

`005_evaluation_rules_and_intraday_040.sql` is additive and idempotent:

- creates `paper_trading.evaluation_rule_sets`;
- inserts one immutable active `PAPER_EVALUATION_V2` rule record;
- attaches groups through nullable/backfilled `evaluation_rule_set_id`;
- adds the +0.4% track to eligible existing equity legs;
- resets only relevant monitor cursors for an idempotent replay;
- records the schema migration version.

No table, row, position, fill, event or historical outcome was deleted.

## Preservation evidence

External backup directory:

`/home/novius2/backups/paper-trading-command-center-20260811T1330Z`

It contains a custom-format paper schema dump, pre/post critical-table counts and SHA-256 manifest with restrictive permissions.

Pre/post comparison:

| Record | Before | After | Explanation |
| --- | ---: | ---: | --- |
| trade groups | 6 | 6 | unchanged |
| trade legs | 2 | 2 | unchanged |
| paper orders | 3 | 3 | unchanged |
| paper fills | 3 | 3 | unchanged |
| positions | 2 | 2 | unchanged |
| target definitions | 12 | 14 | expected +0.4% for two equity legs |
| target tracks | 12 | 14 | expected +0.4% for two equity legs |
| target hits | 1 | 1 | no invented historical hit |
| observation trackers | 2 | 2 | unchanged |
| horizon outcomes | 2 | 2 | unchanged |
| trade events | 88 | 88 | unchanged at migration boundary |
| webhook outbox | 88 | 88 | unchanged at migration boundary |
| migration 005 | — | 1 | exactly once |
| active evaluation rule set | — | 1 | exactly once |

## Standalone prototype

`/home/novius2/NIFTY50/Paper-Trade-UI/NIFTY50_Paper_Trading_Command_Center_Uplift.html`

The file is self-contained and uses six deterministic synthetic trades covering good, mixed, bad and developing paths. It includes a reward/pain atlas, complete matrix and clickable trade drawer. It contains no network call, broker integration or live-order path.

## Verification executed

| Check | Result |
| --- | --- |
| API TypeScript type check | pass |
| Web TypeScript type check | pass |
| API tests | 63 passed |
| Paper service Ruff | pass |
| Paper service mypy | pass |
| Paper service tests | 22 passed |
| Paper service coverage | 85% total |
| Migration repeatability on disposable PostgreSQL | pass |
| Frontend production build | pass |
| Paper service image build | pass |
| Dashboard image build | pass |
| Paper migration job | pass |
| Paper API health | healthy |
| Dashboard health | healthy |
| Playwright deployed command center | 30/30 passed |
| Desktop horizontal overflow | none |
| 768px responsive horizontal overflow | none |
| Live drill-down API errors | none after bigint fix |
| Standalone prototype rows/drawer | pass |

Playwright artifacts:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/paper-trading-command-center`

## Known evidence limitations

The current durable ledger already stores target first hits, aggregate observation MFE/MAE and 5/30-session outcomes. It does not yet store a separate extrema timestamp/source-bar record for each of D0, swing, D+5 and D+30, nor a first-breach row for every adverse threshold. Consequently:

- the command center displays only evidence the database actually has;
- developing windows are not counted as failed targets;
- unavailable chronology is shown as pending/unavailable;
- bar-order ambiguity is stated explicitly;
- no timestamp or adverse breach is fabricated.

The next safe evaluator migration should add clock-specific immutable extrema and adverse-breach events, then reconcile from canonical bars in batches. This is an analytical precision enhancement, not a blocker for the deployed dashboard or the existing target/horizon monitor.

## Operator commands

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml ps
docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml logs --tail=100 paper-api paper-monitor-worker n50-dashboard
```

Regression:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
PLAYWRIGHT_ADMIN_PASSWORD='<mounted admin test secret>' node tools/playwright/paper-trading-regression.mjs
```
