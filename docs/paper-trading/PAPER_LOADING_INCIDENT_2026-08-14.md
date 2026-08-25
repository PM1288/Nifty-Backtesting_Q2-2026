# Paper Trading loading incident — 14 August 2026

## Symptom

`/n50/paper-trading` remained on `Loading durable PAPER observations…` for an excessive period.

## Root cause

The Paper workspace endpoint still calculated `weeklyPerformance`, even though the Weekly Performance widget had already been removed from the UI. The query generated every week from the first paper trade to the current week and ran correlated valuation, P&L and NIFTY lookups for each generated week.

Under concurrent analytical dashboard load, PostgreSQL execution for this unused query was observed at 8.410 seconds and could be delayed much longer by other materialisation queries. The complete Paper endpoint took 8.670 seconds during reproduction.

This was a read-path performance defect. Paper fills, monitoring, target evaluation, P&L, notifications and stored observations remained healthy.

## Correction

1. Removed the unused `weeklyPerformance` database query and response projection from `GET /v1/workspace/paper-trading`.
2. Added a three-second slow-loading explanation.
3. Added a safe 20-second request timeout and an explicit `Retry paper observations` action so the UI cannot spin indefinitely.
4. No paper write, execution, target, P&L or notification behaviour was changed.

## Production evidence

After deployment, three authenticated requests completed as follows:

```text
run=1 status=200 elapsed=0.150673 seconds
run=2 status=200 elapsed=0.103436 seconds
run=3 status=200 elapsed=0.078884 seconds
tradeCount=15 totalGroups=21 openPositions=6
```

The `n50-dashboard` container is healthy. Authenticated desktop/mobile Paper Trading and Backtesting Playwright regression passed with 15 visible trades and no horizontal overflow.

## Validation

```text
API typecheck: passed
Web typecheck: passed
API tests: 89/89 passed
Production image build: passed
Authenticated runtime API: 3/3 HTTP 200
Authenticated Playwright: passed
```

## Backup and rollback

Pre-change files and checksums:

`/home/novius2/backups/paper-loading-fix-20260814-0839`

Rollback requires restoring the three backed-up source files and rebuilding only `n50-dashboard`. No database rollback is needed.
