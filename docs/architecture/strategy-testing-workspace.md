# Strategy Testing Workspace

Status: implementation contract, 2026-08-09

## Purpose

The workspace lets an operator vary allow-listed levels on an immutable strategy
version, run a bounded historical experiment and compare quantity, quality,
risk, capital occupancy and regimes. It is a research control surface. It has no
broker authority and cannot enable live execution.

## Existing contracts reused

- Source features: latest validated/published `nse_app.backtest_feature_daily`
  batch, identified by `batch_run_id`.
- Published dashboard: existing `nse_app.backtest_*` latest-good snapshots.
- Research orchestration pattern: `research.experiment_run` and SKIP-LOCKED
  shard leasing from NIFTY StratLab.
- Target/path evaluation: the governed Rules-of-Engagement, full-path ladder and
  H30 modules under `platform/nifty_stratlab`.
- UI charts and result story: existing Backtesting React components.

The first UI worker adapter uses daily data. It must label same-session target
and adverse ordering as ambiguous when OHLC cannot prove sequence. Minute-level
engines may be added as separately identified datasets, never silently mixed.

## API

```text
GET    /v1/backtesting/lab/catalogue
POST   /v1/backtesting/lab/runs
GET    /v1/backtesting/lab/runs
GET    /v1/backtesting/lab/runs/:runId
GET    /v1/backtesting/lab/runs/:runId/trades
GET    /v1/backtesting/lab/runs/:runId/ladders
GET    /v1/backtesting/lab/runs/:runId/equity
POST   /v1/backtesting/lab/runs/:runId/cancel
```

GET endpoints may use the current guest-readable Backtesting policy. POST
endpoints pass through the existing session guard because guest-read exemption
is restricted to GET. Mutation must also enforce CSRF using the established UI
client/session convention.

### Create request

```json
{
  "schemaVersion": "1.0",
  "strategyVersionId": "rsi30_willr80_closegtprev_tp125_v1",
  "sourceBatchRunId": 258,
  "dateStart": "2025-08-01",
  "dateEnd": "2026-08-06",
  "universe": { "mode": "nifty_100", "symbols": [] },
  "parameters": {
    "rsiMax": 30,
    "willrMax": -80,
    "requireCloseAbovePrevious": true,
    "takeProfitPct": 1.25
  },
  "capital": {
    "mode": "no_capital_limit",
    "startingCapital": null,
    "ticketSize": null,
    "maxPositions": null
  }
}
```

Level values are finite JSON numbers in this bounded research API. The server
normalises and hashes the request. Unknown keys and non-finite/out-of-range
values are rejected. Financial results returned by PostgreSQL may be numeric
strings and are formatted only at the UI boundary.

## Parameter catalogue

Each active lab strategy declares:

- immutable base strategy version and engine version;
- plain-English entry and authoritative exit contract;
- parameter JSON Schema with defaults, increments and server-side bounds;
- supported universe/capital modes and maximum workload;
- diagnostic ladder policy version;
- required source columns and data-quality gates.

Changing parameters creates a new experiment identity. It does not edit the
base strategy or any historical run.

## Durable state

The UI request controller is additive to the existing research ledger. It must
record:

```text
run/request ID
idempotency key and canonical request hash
base strategy and engine versions
source batch and source data-as-of
requested/actual date and universe coverage
parameters and config hash
status and progress counters
lease owner/expiry/heartbeat
requester and timestamps
validation status
summary and result hash
failure classification/detail
```

State transitions:

```text
QUEUED -> RUNNING -> VALIDATING -> COMPLETED
                    |             |
                    +-> FAILED    +-> FAILED_VALIDATION
QUEUED/RUNNING -> CANCEL_REQUESTED -> CANCELLED
```

Completed/failed/cancelled runs are immutable. A retry creates an event and a
new attempt or cloned run according to error classification; it never deletes
prior evidence.

## Evaluation output

Every trade row contains the stock tag, signal/entry identity and point-in-time
context:

```text
symbol, sector, signal date, entry date/time, entry price
RSI, WILLR, SMA20, SMA50, MACD line/signal/histogram
close versus previous close, stock/Nifty/VIX regime where available
Crude Oil, Gold, USD/INR, Dow Jones and India VIX daily context where available
authoritative execution exit, gross/cost/net/tax scenario
open liability and holding/capital days
```

Independent diagnostics:

- intraday reward: +0.3%, +0.5%, +0.7%;
- D+5 swing reward: +1%, +2%, +5%;
- adverse: -0.5%, -1%, -2%, -5%, -10%, below -10%;
- 30-session maximum close/high upside, close/high target timing, MAE, time
  underwater and recovery;
- target-first/adverse-first/ambiguous/neither ordering.

No diagnostic target closes the authoritative execution position. No
alternative target profits are summed into realised portfolio profit.

## UI story

The page uses a light, readable research-workbench layout:

1. **Define** — strategy card, plain-English rules and constrained level inputs.
2. **Scope** — source batch/date coverage, universe and capital scenario.
3. **Verify** — immutable request preview, workload estimate and warnings.
4. **Run** — queue/running progress, elapsed time, worker heartbeat and cancel.
5. **Evaluate** — signal funnel, actual P&L, target/adverse matrix, drawdown,
   capital days, regime heatmap and consolidated trades.
6. **Compare** — clone parameters or open the existing strategy leaderboard.

The route is `/backtesting/lab` and appears first in the Backtesting module
navigation after Overview. Heavy charts remain lazy-loaded.

## Resource controls

- default one worker; configurable bounded worker count;
- maximum three years and 100 symbols in the first daily-engine release;
- query source data in one bounded batch and group by symbol;
- heartbeat/checkpoint at bounded intervals;
- database indexes on status/availability and run/trade lookup;
- bounded trade pagination and no complete trade array in list endpoints;
- explicit timeout/cancellation checks between symbols;
- no automatic retry loop without a ceiling.

## Operator commands

The production image contains both commands but only the analytics service may
run migrations:

```bash
python -m app.cli migrate
python -m app.cli health --require-strategy-lab
python -m app.cli strategy-lab-worker --output-dir /app/runtime/exports/strategy-lab
```

The worker never runs migrations. It waits for the analytics service readiness
check, uses PostgreSQL leases with `FOR UPDATE SKIP LOCKED`, writes one
consolidated `trades.csv` per run and retains failure evidence in the run/event
ledger.

## Promotion

Interactive results remain experimental. Promotion to latest-good dashboard
publication requires deterministic replay, validation gates and an explicit
operator action. The UI must never label a lab run as production-approved.
